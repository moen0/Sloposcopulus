use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

mod connectors;

fn show_widget<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_widget<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_widget(app);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_widget(app);
        }))
        .setup(|app| {
            let show = MenuItemBuilder::with_id("show", "Show Sloposcopulus").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit Sloposcopulus").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            let tray_icon = app
                .default_window_icon()
                .cloned()
                .expect("Sloposcopulus requires a default window icon");

            TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("Sloposcopulus")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => toggle_widget(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_widget(&tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connectors::save_api_key,
            connectors::remove_api_key,
            connectors::list_api_keys,
            connectors::fetch_usage,
            connectors::load_state,
            connectors::save_state,
            connectors::reset_all
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sloposcopulus");
}