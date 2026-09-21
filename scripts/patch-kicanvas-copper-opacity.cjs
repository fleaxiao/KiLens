const fs = require('node:fs');
const path = require('node:path');
const filename = path.resolve(__dirname, '../media/kicanvas.js');
const source = fs.readFileSync(filename, 'utf8');
const before = 'create_layer_set(){return new q3(this.board,this.theme)}';
const after = 'create_layer_set(){let e=new q3(this.board,this.theme);for(let t of ["F.Cu","B.Cu",":F.Cu:Zones",":B.Cu:Zones"]){let r=e.by_name(t);r&&(r.opacity=.75)}return e}';
if (source.includes(after)) {
    console.log('Initial copper opacity: already patched');
} else {
    if (source.split(before).length !== 2) throw new Error('Expected exactly one BoardViewer layer factory');
    fs.writeFileSync(filename, source.replace(before, after));
    console.log('Initial copper opacity: patched to 75% before first draw');
}
