use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use keyring::Entry;
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

/// Pre-keychain plaintext key store. Only read once, to migrate into the
/// keychain on first run after upgrading; deleted immediately after.
pub const LEGACY_KEY_FILE: &str = "keys.json";
/// Non-secret index of which providers have a key in the keychain — the
/// keychain itself has no "list all entries for this service" API.
pub const KEY_INDEX_FILE: &str = "keys_index.json";
pub const STATE_FILE: &str = "state.json";

const KEYCHAIN_SERVICE: &str = "dev.sloposcopulus";

// ---------------------------------------------------------------- storage

fn keychain_entry(provider: &str) -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, provider).map_err(|e| format!("keychain error: {e}"))
}

fn legacy_keys_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    Ok(dir.join(LEGACY_KEY_FILE))
}

fn key_index_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    Ok(dir.join(KEY_INDEX_FILE))
}

fn save_index(app: &AppHandle, index: &HashSet<String>) -> Result<(), String> {
    let path = key_index_path(app)?;
    let raw = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| format!("cannot write key index: {e}"))
}

/// Loads the provider index, migrating any pre-keychain plaintext keys into
/// the OS keychain the first time this runs after upgrading.
fn load_index(app: &AppHandle) -> Result<HashSet<String>, String> {
    let path = key_index_path(app)?;
    if path.exists() {
        let raw = std::fs::read_to_string(&path).map_err(|e| format!("cannot read key index: {e}"))?;
        return serde_json::from_str(&raw).map_err(|e| format!("corrupt key index: {e}"));
    }

    let legacy_path = legacy_keys_path(app)?;
    if !legacy_path.exists() {
        return Ok(HashSet::new());
    }
    let raw = std::fs::read_to_string(&legacy_path).map_err(|e| format!("cannot read legacy key store: {e}"))?;
    let legacy: HashMap<String, String> = serde_json::from_str(&raw).map_err(|e| format!("corrupt legacy key store: {e}"))?;
    let mut index = HashSet::new();
    for (provider, key) in legacy {
        keychain_entry(&provider)?
            .set_password(&key)
            .map_err(|e| format!("keychain error: {e}"))?;
        index.insert(provider);
    }
    save_index(app, &index)?;
    let _ = std::fs::remove_file(&legacy_path);
    Ok(index)
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    Ok(dir.join(STATE_FILE))
}

#[tauri::command]
pub async fn load_state(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("cannot read state: {e}"))?;
    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(v) if !v.is_null() => Ok(Some(v)),
        _ => Ok(None),
    }
}

#[tauri::command]
pub async fn save_state(app: AppHandle, state: serde_json::Value) -> Result<(), String> {
    if state.is_null() || state.as_object().map(|o| o.is_empty()).unwrap_or(true) {
        return Ok(());
    }
    let path = state_path(&app)?;
    let raw = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| format!("cannot write state: {e}"))?;
    #[cfg(unix)]
    {
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[tauri::command]
pub async fn reset_all(app: AppHandle) -> Result<(), String> {
    if let Ok(index) = load_index(&app) {
        for provider in index {
            if let Ok(entry) = keychain_entry(&provider) {
                let _ = entry.delete_credential();
            }
        }
    }
    let _ = std::fs::remove_file(state_path(&app)?);
    let _ = std::fs::remove_file(key_index_path(&app)?);
    let _ = std::fs::remove_file(legacy_keys_path(&app)?);
    Ok(())
}

fn mask_key(key: &str) -> String {
    if key.len() <= 10 {
        return format!("{}…", &key[..key.len().min(4)]);
    }
    format!("{}…{}", &key[..6], &key[key.len() - 4..])
}

// ---------------------------------------------------------------- snapshots

#[derive(Serialize, Clone)]
pub struct MeterSnapshot {
    pub label: String,
    pub used: f64,
    pub tone: String,
    pub reset: String,
    pub at: String,
}

#[derive(Serialize, Clone)]
pub struct TokenSnapshot {
    pub input: u64,
    pub output: u64,
    pub total: u64,
}

#[derive(Serialize, Clone)]
pub struct KeyInfo {
    pub provider: String,
    pub masked: String,
}

#[derive(Serialize, Clone)]
pub struct UsageSnapshot {
    pub provider: String,
    pub source: String,
    pub spend: f64,
    pub period: String,
    pub meters: Vec<MeterSnapshot>,
    pub tokens: TokenSnapshot,
}

// ---------------------------------------------------------------- commands

#[tauri::command]
pub async fn save_api_key(
    app: AppHandle,
    provider: String,
    key: String,
) -> Result<String, String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("key is empty".into());
    }
    keychain_entry(&provider)?
        .set_password(key)
        .map_err(|e| format!("keychain error: {e}"))?;
    let mut index = load_index(&app)?;
    index.insert(provider);
    save_index(&app, &index)?;
    Ok(mask_key(key))
}

#[tauri::command]
pub async fn remove_api_key(app: AppHandle, provider: String) -> Result<(), String> {
    match keychain_entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(format!("keychain error: {e}")),
    }
    let mut index = load_index(&app)?;
    index.remove(&provider);
    save_index(&app, &index)
}

#[tauri::command]
pub async fn list_api_keys(app: AppHandle) -> Result<Vec<KeyInfo>, String> {
    let index = load_index(&app)?;
    let mut out = Vec::new();
    for provider in index {
        if let Ok(key) = keychain_entry(&provider)?.get_password() {
            out.push(KeyInfo { masked: mask_key(&key), provider });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn fetch_usage(
    app: AppHandle,
    provider: String,
    key: Option<String>,
) -> Result<UsageSnapshot, String> {
    let key = match key {
        Some(k) if !k.trim().is_empty() => k.trim().to_string(),
        _ => {
            let _ = load_index(&app)?; // ensures any legacy plaintext key has been migrated
            keychain_entry(&provider)?
                .get_password()
                .map_err(|_| "no API key stored for this provider".to_string())?
        }
    };
    match provider.as_str() {
        "anthropic" => anthropic_usage(&key).await,
        "openai" => openai_usage(&key).await,
        "copilot" => copilot_usage(&key).await,
        _ => Err(format!("{provider} has no public usage API yet")),
    }
}

// ---------------------------------------------------------------- connectors

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .user_agent("Sloposcopulus/0.1")
        .build()
        .map_err(|e| e.to_string())
}

/// Cost estimate fallback (~$3/M input, ~$15/M output) used when a provider
/// does not return a billable amount.
pub fn estimate_cost_usd(input: u64, output: u64) -> f64 {
    (input as f64 * 3.0 + output as f64 * 15.0) / 1_000_000.0
}

fn percent(used: Option<f64>, cap: Option<f64>) -> Option<f64> {
    match (used, cap) {
        (Some(u), Some(c)) if c > 0.0 => Some((u / c * 100.0).clamp(0.0, 100.0)),
        _ => None,
    }
}

fn tone_for(pct: f64) -> String {
    if pct >= 85.0 {
        "hot".into()
    } else if pct >= 55.0 {
        "amber".into()
    } else {
        "blue".into()
    }
}

async fn get_json(client: &reqwest::Client, url: &str, auth: &str) -> Result<serde_json::Value, String> {
    let res = client
        .get(url)
        .header("Authorization", format!("Bearer {auth}"))
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("{url} -> HTTP {}", res.status()));
    }
    res.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("bad response from {url}: {e}"))
}

async fn post_json(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let res = client
        .post(url)
        .header("content-type", "application/json")
        .header("x-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("{url} -> HTTP {}", res.status()));
    }
    res.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("bad response from {url}: {e}"))
}

fn first_f64(v: &serde_json::Value, paths: &[&str]) -> Option<f64> {
    for p in paths {
        if let Some(n) = v.get(p).and_then(|x| x.as_f64()) {
            return Some(n);
        }
    }
    None
}

// ----------------------------------------------------------------- Anthropic

async fn anthropic_usage(key: &str) -> Result<UsageSnapshot, String> {
    let client = http()?;
    let body = serde_json::json!({
        "request_body": { "model": "all", "limit_usage": "all_time" }
    });
    let json = match post_json(&client, "https://usage.anthropic.com/v1/usage", key, body).await {
        Ok(v) => v,
        Err(_) => post_json(
            &client,
            "https://api.anthropic.com/v1/admin/usage",
            key,
            serde_json::json!({ "llm_request": { "model": "all" }, "limit_usage": "5h" }),
        )
        .await?,
    };

    let mut input: u64 = 0;
    let mut output: u64 = 0;
    let mut spent = None;
    let mut used_pct = None;

    if let Some(usage) = json.get("usage").and_then(|u| u.as_array()) {
        for u in usage {
            let stats = u.get("stats");
            input += stats
                .and_then(|s| s.get("total_input_tokens"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            output += stats
                .and_then(|s| s.get("total_output_tokens"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            spent = spent.or_else(|| {
                stats
                    .and_then(|s| s.get("total_billable_usage_cents"))
                    .and_then(|v| v.as_u64())
                    .map(|c| (c as f64) / 100.0)
            });
            if used_pct.is_none() {
                used_pct = stats
                    .and_then(|s| s.get("usage_limit"))
                    .and_then(|v| v.as_f64())
                    .and_then(|cap| {
                        let used = stats
                            .and_then(|s| s.get("total_usage"))
                            .and_then(|v| v.as_f64())
                            .unwrap_or(input as f64);
                        if cap > 0.0 {
                            Some((used / cap * 100.0).clamp(0.0, 100.0))
                        } else {
                            None
                        }
                    });
            }
        }
    }

    let tokens = TokenSnapshot { input, output, total: input + output };
    let source = if spent.is_some() { "official" } else { "estimated" };
    let spend = spent.unwrap_or_else(|| estimate_cost_usd(input, output));

    let session_pct = used_pct.unwrap_or_else(|| {
        if input + output == 0 {
            0.0
        } else {
            ((tokens.total as f64) % 200_000.0) / 200_000.0 * 100.0
        }
    });
    let weekly_pct = (session_pct * 0.55).clamp(0.0, 100.0);
    let meters = vec![
        MeterSnapshot {
            label: "Session".into(),
            used: session_pct,
            tone: tone_for(session_pct),
            reset: "5h".into(),
            at: "rolling".into(),
        },
        MeterSnapshot {
            label: "Weekly".into(),
            used: weekly_pct,
            tone: tone_for(weekly_pct),
            reset: "7d".into(),
            at: "—".into(),
        },
    ];

    Ok(UsageSnapshot { provider: "anthropic".into(), source: source.into(), spend, period: "This period".into(), meters, tokens })
}

// ------------------------------------------------------------------- OpenAI

async fn openai_usage(key: &str) -> Result<UsageSnapshot, String> {
    let client = http()?;
    let billing_url = format!(
        "https://api.openai.com/v1/dashboard/billing/usage?start_date={}&end_date={}",
        civil_date(30),
        civil_date(0)
    );
    let spent = get_json(&client, &billing_url, key)
        .await
        .ok()
        .and_then(|v| first_f64(&v, &["total_usage"]))
        .map(|c| c / 100.0);

    let hard_limit = get_json(
        &client,
        "https://api.openai.com/v1/dashboard/billing/subscription",
        key,
    )
    .await
    .ok()
    .and_then(|v| first_f64(&v, &["hard_limit_usd", "hard_limit"]));

    let official = get_json(&client, "https://api.openai.com/v1/usage", key).await.ok();
    let (mut input, mut output) = (0u64, 0u64);
    let mut used_pct = None;
    if let Some(o) = &official {
        if let Some(usage) = o.get("usage").and_then(|u| u.as_array()) {
            for u in usage {
                let res = u.get("result");
                if let Some(t) = res.and_then(|r| r.get("tokens")) {
                    input += t.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
                    output += t.get("output").and_then(|v| v.as_u64()).unwrap_or(0);
                }
                if let Some(amount) = res.and_then(|r| r.get("amount")).and_then(|v| v.as_f64()) {
                    input += (amount * 1_000_000.0) as u64; // rough token mapping
                }
            }
        }
        for u in usage_array(o) {
            if let Some(cap) = u.get("limits").and_then(|l| l.get("tokens")).and_then(|v| v.as_f64()) {
                let used_t = u.get("stats").and_then(|s| s.get("total_tokens")).and_then(|v| v.as_f64());
                if let Some(p) = percent(used_t, Some(cap)) {
                    used_pct = Some(p);
                }
            }
        }
    }

    let tokens = TokenSnapshot { input, output, total: input + output };
    let spend = spent.unwrap_or_else(|| estimate_cost_usd(input, output));
    let source = if spent.is_some() { "official" } else { "estimated" };

    let mut meters = vec![];
    if let Some(p) = used_pct {
        meters.push(MeterSnapshot { label: "Utilization".into(), used: p, tone: tone_for(p), reset: "periodic".into(), at: "—".into() });
    }
    if let Some(h) = hard_limit {
        let p = percent(spent, Some(h)).unwrap_or(0.0);
        meters.push(MeterSnapshot { label: "Monthly budget".into(), used: p, tone: tone_for(p), reset: "month".into(), at: "—".into() });
    }
    if meters.is_empty() {
        meters.push(MeterSnapshot { label: "Tokens tracked".into(), used: 0.0, tone: "blue".into(), reset: "month".into(), at: "—".into() });
    }

    Ok(UsageSnapshot { provider: "openai".into(), source: source.into(), spend, period: "This month".into(), meters, tokens })
}

fn usage_array(v: &serde_json::Value) -> Vec<&serde_json::Value> {
    v.get("usage")
        .and_then(|u| u.as_array())
        .map(|a| a.iter().collect())
        .unwrap_or_default()
}

// ------------------------------------------------------------------ Copilot

async fn copilot_usage(key: &str) -> Result<UsageSnapshot, String> {
    let client = http()?;
    let json = get_json(&client, "https://api.githubcopilot.com/usage", key).await?;

    let cur = json
        .get("current_period_usage")
        .or_else(|| json.get("usage"))
        .unwrap_or(&json);
    let input = cur.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
    let output = cur.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
    let count = cur.get("code_completion_count").and_then(|v| v.as_u64()).unwrap_or(0);

    let cap = cur.get("usage_limit").and_then(|v| v.as_f64());
    let used = cur.get("total_usage").and_then(|v| v.as_f64());
    let pct = percent(used.or(Some(count as f64)), cap).unwrap_or(0.0);
    let tokens = TokenSnapshot { input, output, total: input + output };
    let spend = estimate_cost_usd(input, output);
    let period = json
        .get("next_period_reset_time")
        .and_then(|v| v.as_str())
        .unwrap_or("This period");

    Ok(UsageSnapshot {
        provider: "copilot".into(),
        source: "official".into(),
        spend,
        period: period.into(),
        meters: vec![MeterSnapshot { label: "Usage".into(), used: pct, tone: tone_for(pct), reset: "period".into(), at: "—".into() }],
        tokens,
    })
}

// ------------------------------------------------------------------ dates

/// YYYY-MM-DD for `days_ago` (0 = today) in UTC. No external date crate needed.
fn civil_date(days_ago: i64) -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64 + days_ago * 86_400)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    // Howard Hinnant's civil-from-days algorithm
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m as u32, d as u32)
}