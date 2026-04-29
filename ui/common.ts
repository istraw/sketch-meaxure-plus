import { ExportData } from '../src/meaxure/interfaces'
import { ArtboardData } from "../src/meaxure/interfaces"

interface State {
    zoom: number,
    unit: string,
    scale: number,
    artboardIndex: number,
    colorFormat: string,
    showSliceBounds: boolean,
    current: ArtboardData,
    selectedIndex: number,
    codeType: string,
    targetIndex: number,
    tempTargetRect: any,
}

export const state: State = <State>{
    zoom: 1,
    unit: 'px',
    scale: 1,
    artboardIndex: undefined,
    colorFormat: 'color-hex',
    showSliceBounds: false,
    current: undefined,
    codeType: 'css',
}

export var I18N = {};
export var lang = normalizeLangCode(navigator.language);
export var timestamp = new Date().getTime();

export function localize(str) {
    return (I18N[lang] && I18N[lang][str]) ? I18N[lang][str] : str;
}

export type ProjectData = ExportData & { colorNames: { [key: string]: string } }
export let project: ProjectData = <ProjectData>{};

export function init(data: ProjectData): void {
    state.scale = 1;
    state.colorFormat = data.colorFormat;
    state.unit = data.unit;
    state.showSliceBounds = false;
    lang = normalizeLangCode(data.language || navigator.language);
    I18N = data.languages || {};
    project = data;
}

function normalizeLangCode(code: string): string {
    let langCode = String(code || '').toLocaleLowerCase();
    if (langCode.startsWith('zh-hans') || langCode.startsWith('zh-cn')) return 'zh-cn';
    if (langCode.startsWith('zh-hant') || langCode.startsWith('zh-tw')) return 'zh-tw';
    if (langCode.startsWith('en')) return 'en';
    return langCode;
}
