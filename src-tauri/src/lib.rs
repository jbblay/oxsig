use tauri::Manager;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Create system tray
  let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
  let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
  let update_i = MenuItem::with_id(app, "check_update", "Check for Updates", true, None::<&str>)?;

  let app_menu = Submenu::with_items(app, "App", &[&show_i, &update_i, &quit_i])?;
  let menu = Menu::with_items(app, &[&app_menu])?;

      let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "quit" => {
            app.exit(0);
          }
          "show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          "check_update" => {
            let handle = app.app_handle();
            tauri::async_runtime::spawn(async move {
              if let Ok(update) = tauri_plugin_updater::check_update(&handle).await {
                if update.is_update_available() {
                  let _ = update.download_and_install(|_chunk, _total| {}).await;
                  // Optionally: prompt restart
                  if let Some(win) = handle.get_webview_window("main") {
                    let _ = win.eval("alert('Update installed. Please restart the app.');");
                  }
                } else if let Some(win) = handle.get_webview_window("main") {
                  let _ = win.eval("alert('You are up to date.');");
                }
              }
            });
          }
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click { .. } = event {
            let app = tray.app_handle();
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
        })
        .build(app)?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
