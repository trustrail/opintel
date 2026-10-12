// With isolate:false this dependency executes once per process, while Vitest
// executes the setup file before each file. Never rebind DATABASE_URL twice.
import '../../test/setup.js';
