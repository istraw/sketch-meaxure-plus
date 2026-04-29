/// <reference path="../../../node_modules/cocoascript-types/types/index.d.ts" />
/// <reference path="../../../node_modules/sketch-internal-types/types/index.d.ts" />
/// <reference path="../../../node_modules/sketch-types/types/index.d.ts" />

declare module 'sketch/sketch' {
    import sketch = require('sketch');
    import dom = require('sketch/dom');

    namespace _Sketch {
        interface Sketch { }
        interface Document extends dom.Document { }
        interface Layer extends dom.Layer { }
        interface Text extends dom.Text { }
        interface ShapePath extends dom.ShapePath { }
        interface SymbolInstance extends dom.SymbolInstance { }
        interface Rectangle extends dom.Rectangle { }
    }

    export = sketch;
}

declare global {
    type Document = import('sketch/dom').Document;
    type Selection = import('sketch/dom').Selection;
    type Page = import('sketch/dom').Page;
    type Artboard = import('sketch/dom').Artboard;
    type Layer = import('sketch/dom').Layer;
    type Group = import('sketch/dom').Group;
    type Rectangle = import('sketch/dom').Rectangle;
    type Shape = import('sketch/dom').Shape;
    type ShapePath = import('sketch/dom').ShapePath;
    type Text = import('sketch/dom').Text;
    type SymbolMaster = import('sketch/dom').SymbolMaster;
    type SymbolInstance = import('sketch/dom').SymbolInstance;
    type HotSpot = import('sketch/dom').HotSpot;
    type Image = import('sketch/dom').Image;
    type SharedStyle = import('sketch/dom').SharedStyle;
    type Style = import('sketch/dom').Style;
    type Fill = import('sketch/dom').Fill;
    type Border = import('sketch/dom').Border;
    type Shadow = import('sketch/dom').Shadow;
    type Gradient = import('sketch/dom').Gradient;
    type Point = import('sketch/dom').Point;
    type FillType = import('sketch/dom').Style.FillType;
    type BorderPosition = import('sketch/dom').Style.BorderPosition;
    type GradientType = import('sketch/dom').Style.GradientType;
    type AnimationType = import('sketch/dom').Flow.AnimationType;
    type Alignment = import('sketch/dom').Text.Alignment;
    type VerticalAlignment = import('sketch/dom').Text.VerticalAlignment;

    interface FontAxes {
        id: string;
        min: number;
        max: number;
        value: number;
    }
}

export { }
