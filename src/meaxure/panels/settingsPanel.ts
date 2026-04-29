// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { context } from '../common/context';
import { createWebviewPanel } from '../../webviewPanel';
import { logger } from '../common/logger';
import { getResourcePath } from '../helpers/helper';
import { getLanguage } from '../common/language';
import { localizePluginMenu } from '../common/menuLocalization';

interface SettingData {
    language?: Object;
    languageCode?: string;
    scale: number;
    units: string;
    colorFormat: string;
}

export function settingsPanel() {
    let panel = createWebviewPanel({
        identifier: 'com.istraw.sketch-meaxure-plus.settings',
        url: getResourcePath() + "/panel/settings.html",
        width: 280,
        height: 438,
    });
    if (!panel) return undefined;

    let data = <SettingData>{};
    data.language = getLanguage();
    if (context.configs) {
        data.languageCode = context.configs.language;
        data.scale = context.configs.resolution;
        data.units = context.configs.units;
        data.colorFormat = context.configs.format;
    }
    panel.onDidReceiveMessage('init', () => data);
    panel.onDidReceiveMessage<SettingData>('submit', data => {
        context.configs.language = data.languageCode || 'auto';
        context.configs.resolution = data.scale;
        context.configs.units = data.units;
        context.configs.format = data.colorFormat;
        localizePluginMenu();
        panel.close();
    });
    panel.show();
}
