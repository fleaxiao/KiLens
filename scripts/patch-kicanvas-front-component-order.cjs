const fs = require('fs');
const path = require('path');
const { replaceExactlyOnce } = require('./patch-utils.cjs');

const bundlePath = path.resolve(__dirname, '..', 'media', 'kicanvas.js');
let bundle = fs.readFileSync(bundlePath);

// View layers are displayed in reverse registration order. Register the
// front-side component layers before F.Cu so they are composited above it.
const layerOrderBefore = Buffer.from(
	'S.pads_front_netname=":Pads:Front:NetName",S.pads_front=":Pads:Front",S.f_cu="F.Cu",S.f_mask="F.Mask",S.f_silks="F.SilkS",S.f_adhes="F.Adhes",S.f_paste="F.Paste",S.f_crtyd="F.CrtYd",S.f_fab="F.Fab"'
);
const layerOrderAfter = Buffer.from(
	'S.pads_front_netname=":Pads:Front:NetName",S.pads_front=":Pads:Front",S.f_fab="F.Fab",S.f_crtyd="F.CrtYd",S.f_adhes="F.Adhes",S.f_paste="F.Paste",S.f_silks="F.SilkS",S.f_mask="F.Mask",S.f_cu="F.Cu"'
);

bundle = replaceExactlyOnce(
	bundle,
	layerOrderBefore,
	layerOrderAfter,
	'front component display order'
);
fs.writeFileSync(bundlePath, bundle);
