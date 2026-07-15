#!/usr/bin/env node
import { run } from './main';

run().catch((err) => {
  console.error('Fatal CLI execution exception:', err);
  process.exit(1);
});
