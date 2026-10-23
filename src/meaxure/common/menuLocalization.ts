import { localizeSystem, getAllLanguage } from "./language";
const menuAliases: { [key: string]: string[] } = {
    "Sketch MeaXure": ["Sketch MeaXure Plus"],
    "Toolbar": ["Toolbar"],
    "Mark Overlay": ["Mark Overlay", "高亮区域"],
    "Mark Sizes": ["Mark Sizes", "标注尺寸", "標記尺寸"],
    "Mark Spacings": ["Mark Spacings", "标注间距", "標記間距"],
    "Mark Properties": ["Mark Properties", "标注属性", "標記屬性"],
    "Mark Note": ["Mark Note", "标注备注", "標記備註"],
    "Mark Coordinate": ["Mark Coordinate", "标注坐标", "標記坐標"],
    "Spec Export": ["Spec Export", "导出标注", "匯出標註"],
    "Toggle Hidden": ["Toggle Hidden", "切换可见", "切換可見"],
    "Toggle Locked": ["Toggle Locked", "切换锁定", "切換鎖定"],
    "Clear Marks": ["Clear Marks", "清除标注", "清除標註"],
    "Settings": ["Settings", "设置", "設置"],
    "Rename Old Markers": ["Rename Old Markers", "重命名旧标记", "重新命名舊標記"],
    "Run Script": ["Run Script", "运行脚本", "執行腳本"],
    "Feedback": ["Feedback", "反馈", "反饋"],
    "Home": ["Home", "主页", "主頁"],
    "Help": ["Help", "帮助", "幫助"],
};

export function localizePluginMenu(plugin?: any) {
    if (plugin) localizeMenuDefinitions(plugin);
    let mainMenu = NSApp && NSApp.mainMenu ? NSApp.mainMenu() : undefined;
    if (!mainMenu) return;
    let pluginMenuItem = findPluginMenuItem(mainMenu);
    if (!pluginMenuItem || !pluginMenuItem.submenu || !pluginMenuItem.submenu()) return;
    relabelMenu(pluginMenuItem.submenu());
    if (matchAlias(String(pluginMenuItem.title()), "Sketch MeaXure")) {
        pluginMenuItem.setTitle("Sketch MeaXure Plus");
    }
}

function localizeMenuDefinitions(plugin: any) {
    // Sketch rebuilds NSMenuItems whenever Plugins is opened. Translate the
    // backing command models and submenu description, not only live titles.
    let commands = plugin.commands().allValues();
    for (let i = 0; i < commands.count(); i++) {
        let command = commands.objectAtIndex(i);
        let key = getTitleKey(String(command.name()));
        if (key) command.setValue_forKey(localizeSystem(key), 'name');
    }
    let data = NSJSONSerialization.dataWithJSONObject_options_error(plugin.menuDescription(), 0, nil);
    let description = JSON.parse(String(NSString.alloc().initWithData_encoding(data, 4)));
    function translateMenu(menu: any) {
        if (menu.title) {
            let key = getTitleKey(menu.title);
            if (key) menu.title = key === 'Sketch MeaXure' ? 'Sketch MeaXure Plus' : localizeSystem(key);
        }
        for (let item of menu.items || []) {
            if (typeof item === 'object' && item) translateMenu(item);
        }
    }
    translateMenu(description);
    plugin.setMenuDescription(description);
    persistMenuLanguage(plugin);
}

function persistMenuLanguage(plugin: any) {
    // Sketch may reload the bundle from disk, discarding translated models.
    // Keep its installed manifest in sync, writing only when titles change so
    // the file watcher settles after a single reload. Source templates stay intact.
    if (!plugin.url) return;
    try {
        const path = String(plugin.url().path()) + '/Contents/Sketch/manifest.json';
        const source = NSString.stringWithContentsOfFile_encoding_error(path, 4, nil);
        if (!source) return;
        const manifest = JSON.parse(String(source));
        const before = JSON.stringify(manifest);
        for (const command of manifest.commands || []) {
            const key = getTitleKey(command.name || '');
            if (key) command.name = localizeSystem(key);
        }
        function translateMenu(menu: any) {
            if (!menu) return;
            const key = getTitleKey(menu.title || '');
            if (key && key !== 'Sketch MeaXure') menu.title = localizeSystem(key);
            for (const item of menu.items || []) {
                if (item && typeof item === 'object') translateMenu(item);
            }
        }
        translateMenu(manifest.menu);
        if (JSON.stringify(manifest) === before) return;
        const content = NSString.stringWithString(JSON.stringify(manifest, null, 2) + '\n');
        if (!content.writeToFile_atomically_encoding_error(path, true, 4, nil)) {
            console.warn('Could not persist plugin menu language: ' + path);
        }
    } catch (error) {
        // Read-only installations still get the translated in-memory menu.
        console.warn('Could not persist plugin menu language: ' + error);
    }
}

function findPluginMenuItem(menu: any): any {
    let count = menu.numberOfItems ? menu.numberOfItems() : 0;
    for (let i = 0; i < count; i++) {
        let item = menu.itemAtIndex(i);
        if (!item) continue;
        if (matchAlias(String(item.title()), "Sketch MeaXure")) return item;
        let submenu = item.submenu ? item.submenu() : undefined;
        if (!submenu) continue;
        let found = findPluginMenuItem(submenu);
        if (found) return found;
    }
    return undefined;
}

function relabelMenu(menu: any) {
    let count = menu.numberOfItems ? menu.numberOfItems() : 0;
    for (let i = 0; i < count; i++) {
        let item = menu.itemAtIndex(i);
        if (!item) continue;
        let title = String(item.title());
        let key = getTitleKey(title);
        if (key) item.setTitle(localizeSystem(key));
        let submenu = item.submenu ? item.submenu() : undefined;
        if (submenu) relabelMenu(submenu);
    }
}

function getTitleKey(title: string): string {
    for (let key of Object.keys(menuAliases)) {
        if (matchAlias(title, key)) return key;
    }
    return "";
}

function matchAlias(title: string, key: string): boolean {
    title = title.trim();
    if ((menuAliases[key] || []).indexOf(title) >= 0) return true;
    if (key === 'Sketch MeaXure') return false;
    // Recognize every translated title when switching back to another language.
    let languages = getAllLanguage();
    return Object.keys(languages).some(code => languages[code][key] === title);
}
