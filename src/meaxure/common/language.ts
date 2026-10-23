// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { getResourcePath } from "../helpers/helper";
import { sketch } from "../../sketch";

let aliases = {
    "zh-Hans": "zh-cn",
    "zh-Hant": "zh-tw",
    "en": "en"
}

let caches: { [key: string]: Object } = {};

export function getLanguage(): Object | null {
    return loadLanguage(getLangCode());
}

export function getAllLanguage(): { [key: string]: Object } {
    let all: { [key: string]: Object } = {}
    for (let v of Array.from(new Set(Object.values(aliases)))) {
        let lang = loadLanguage(v);
        if (lang) all[v] = lang;
    }
    return all;
}

export function localize(str: string, ...data) {
    let langs = loadLanguage(getLangCode());
    if (langs && langs[str]) {
        str = langs[str];
    }
    let idx = -1;
    return str.replace(/\%\@/gi, function () {
        idx++;
        return data[idx];
    });
}

// App menus follow macOS/Sketch's preferred language, independently of the
// language selected for a document's panels and exported specs.
export function localizeSystem(str: string): string {
    let language = loadLanguage(getSystemLangCode());
    return language && language[str] || str;
}

function loadLanguage(code: string): Object | null {
    if (!code) return null;
    if (caches[code] !== undefined) {
        return caches[code];
    }
    let langFile = getResourcePath() + "/i18n/" + code + ".json";
    if (!NSFileManager.defaultManager().fileExistsAtPath(langFile)) {
        return null;
    }
    let language = NSString.stringWithContentsOfFile_encoding_error(langFile, 4, nil) as string;
    return caches[code] = JSON.parse(language);
}

export function getLangCode(): string {
    let configured = getConfiguredLangCode();
    if (configured) return configured;

    return getSystemLangCode();
}

export function getSystemLangCode(): string {
    let languages = NSUserDefaults.standardUserDefaults().objectForKey("AppleLanguages");
    if (!languages || !languages.count()) return 'en';
    let language = String(languages.objectAtIndex(0)).toLowerCase().replace(/_/g, '-');
    if (/^zh-(hant|tw|hk|mo)(-|$)/.test(language)) return 'zh-tw';
    if (/^zh(-|$)/.test(language)) return 'zh-cn';
    return 'en';
}

function getConfiguredLangCode(): string {
    let document = NSDocumentController.sharedDocumentController().currentDocument();
    if (!document) return "";
    let value = sketch.Settings.documentSettingForKey<string>(document, 'language');
    if (!value || value === 'auto') return "";
    return String(value).toLowerCase();
}
