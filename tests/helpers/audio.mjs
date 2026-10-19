export class Param {
  value = 1;
  events = [];
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  setTargetAtTime(value, time, constant) { this.value = value; this.events.push(['target', value, time, constant]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(['exponential', value, time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
}
class Node {
  connections = new Set();
  gain = new Param(); frequency = new Param(); Q = new Param(); playbackRate = new Param();
  onended = null; startTime = Infinity; endTime = Infinity;
  constructor(context) { this.context = context; context.nodes.add(this); }
  connect(node) { this.connections.add(node); return node; }
  disconnect() { this.connections.clear(); }
  start(time = this.context.currentTime) { this.startTime = time; }
  stop(time = this.context.currentTime) { this.endTime = time; }
}
export class Context extends EventTarget {
  currentTime = 0; sampleRate = 8000; state = 'suspended'; nodes = new Set(); buffers = []; resumeCalls = 0; closeCalls = 0;
  constructor() { super(); this.destination = new Node(this); }
  createGain() { return new Node(this); }
  createBiquadFilter() { return new Node(this); }
  createOscillator() { return new Node(this); }
  createBufferSource() { return new Node(this); }
  createBuffer(channels, length, rate) {
    const data = new Float32Array(length), buffer = { duration: length / rate, length, sampleRate: rate, getChannelData: () => data };
    this.buffers.push(buffer); return buffer;
  }
  async resume() { this.resumeCalls++; this.state = 'running'; this.dispatchEvent(new Event('statechange')); }
  async suspend() { this.state = 'suspended'; this.dispatchEvent(new Event('statechange')); }
  async close() { this.closeCalls++; this.state = 'closed'; this.dispatchEvent(new Event('statechange')); }
  advance(seconds) {
    this.currentTime += seconds;
    for (const node of this.nodes) {
      const end = Math.min(node.endTime, node.buffer ? node.startTime + node.buffer.duration / node.playbackRate.value : Infinity);
      if (end <= this.currentTime && node.onended) node.onended();
    }
  }
}
export function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}
