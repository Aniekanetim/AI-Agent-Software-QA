import { installFixtureChrome } from './fixture-browser.js';

console.log(JSON.stringify(await installFixtureChrome(process.cwd())));
