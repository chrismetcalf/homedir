// One-minute load average. os.loadavg() is a libc call, not a fork, and works
// on both Linux and macOS — no /proc dependency.
const os = require('node:os')

module.exports = {
  name: 'load',
  enabled: () => true,
  render: () => os.loadavg()[0].toFixed(2),
}
