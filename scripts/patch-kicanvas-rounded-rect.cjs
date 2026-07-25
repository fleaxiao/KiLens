const fs = require('fs');
const path = require('path');

const bundlePath = path.resolve(__dirname, '..', 'media', 'kicanvas.js');
let bundle = fs.readFileSync(bundlePath);

const parserBefore = Buffer.from('a.vec2("start"),a.vec2("end"),a.pair("layer",R.string)');
const parserAfter = Buffer.from('a.vec2("start"),a.vec2("end"),a.pair("radius",R.number),a.pair("layer",R.string)');

const painterBefore = Buffer.from('paint(t,r){if(this.filter_net)return;let i=t.color,n=[r.start,new d(r.end.x,r.start.y),r.end,new d(r.start.x,r.end.y),r.start];this.styled_line(n,r.width,i,r.stroke_params),this.isFillValid(r.fill)&&this.gfx.polygon(new J(n,i))}');
const painterWithoutClosure = Buffer.from('paint(t,r){if(this.filter_net)return;let i=t.color,n;if(r.radius>0){let o=Math.min(r.radius,Math.abs(r.end.x-r.start.x)/2,Math.abs(r.end.y-r.start.y)/2),l=Math.min(r.start.x,r.end.x),p=Math.max(r.start.x,r.end.x),u=Math.min(r.start.y,r.end.y),m=Math.max(r.start.y,r.end.y);n=[];let _=(g,Z,T,w)=>{for(let B=0;B<=8;B++){let F=g+(Z-g)*B/8;n.push(new d(T+Math.cos(F)*o,w+Math.sin(F)*o))}};_(-Math.PI/2,0,p-o,u+o),_(0,Math.PI/2,p-o,m-o),_(Math.PI/2,Math.PI,l+o,m-o),_(Math.PI,Math.PI*3/2,l+o,u+o)}else n=[r.start,new d(r.end.x,r.start.y),r.end,new d(r.start.x,r.end.y),r.start];this.styled_line(n,r.width,i,r.stroke_params),this.isFillValid(r.fill)&&this.gfx.polygon(new J(n,i))}');
const painterAfter = Buffer.from('paint(t,r){if(this.filter_net)return;let i=t.color,n;if(r.radius>0){let o=Math.min(r.radius,Math.abs(r.end.x-r.start.x)/2,Math.abs(r.end.y-r.start.y)/2),l=Math.min(r.start.x,r.end.x),p=Math.max(r.start.x,r.end.x),u=Math.min(r.start.y,r.end.y),m=Math.max(r.start.y,r.end.y);n=[];let _=(g,Z,T,w)=>{for(let B=0;B<=8;B++){let F=g+(Z-g)*B/8;n.push(new d(T+Math.cos(F)*o,w+Math.sin(F)*o))}};_(-Math.PI/2,0,p-o,u+o),_(0,Math.PI/2,p-o,m-o),_(Math.PI/2,Math.PI,l+o,m-o),_(Math.PI,Math.PI*3/2,l+o,u+o),n.push(n[0])}else n=[r.start,new d(r.end.x,r.start.y),r.end,new d(r.start.x,r.end.y),r.start];this.styled_line(n,r.width,i,r.stroke_params),this.isFillValid(r.fill)&&this.gfx.polygon(new J(n,i))}');

function replaceExactlyOnce(source, before, after, label) {
	const firstOccurrence = source.indexOf(before);
	const secondOccurrence = firstOccurrence < 0 ? -1 : source.indexOf(before, firstOccurrence + before.length);
	if (firstOccurrence < 0 && source.indexOf(after) >= 0) {
		console.log(`${label}: already patched`);
		return source;
	}
	if (firstOccurrence < 0 || secondOccurrence >= 0) {
		throw new Error(`${label}: expected exactly one match`);
	}
	console.log(`${label}: patched`);
	return Buffer.concat([
		source.subarray(0, firstOccurrence),
		after,
		source.subarray(firstOccurrence + before.length)
	]);
}

bundle = replaceExactlyOnce(bundle, parserBefore, parserAfter, 'gr_rect radius parser');
if (bundle.indexOf(painterWithoutClosure) >= 0) {
	bundle = replaceExactlyOnce(bundle, painterWithoutClosure, painterAfter, 'rounded rectangle closure');
} else {
	bundle = replaceExactlyOnce(bundle, painterBefore, painterAfter, 'rounded rectangle painter');
}
fs.writeFileSync(bundlePath, bundle);
