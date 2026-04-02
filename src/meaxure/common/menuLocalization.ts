import { localize } from "./language";

const menuAliases: { [key: string]: string[] } = {
    "Sketch MeaXure": ["Sketch MeaXure", "Sketch hMeaXure"],
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

export function localizePluginMenu() {
    let mainMenu = NSApp && NSApp.mainMenu ? NSApp.mainMenu() : undefined;
    if (!mainMenu) return;
    let pluginMenuItem = findPluginMenuItem(mainMenu);
    if (!pluginMenuItem || !pluginMenuItem.submenu || !pluginMenuItem.submenu()) return;
    relabelMenu(pluginMenuItem.submenu());
    if (matchAlias(String(pluginMenuItem.title()), "Sketch MeaXure")) {
        pluginMenuItem.setTitle(localize("Sketch MeaXure"));
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
        if (key) item.setTitle(localize(key));
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
    return (menuAliases[key] || []).indexOf(title) >= 0;
}
