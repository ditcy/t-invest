import {
  runBacktestFinalCloseTests,
  runBacktestTests
} from "./lib/backtest.test.js";
import {
  runMultiWindowTests,
  runSingleWindowTests
} from "./lib/candles.test.js";

const testCases: Array<{ name: string; run: () => void }> = [
  {
    name: "backtest is deterministic for identical inputs",
    run: runBacktestTests
  },
  {
    name: "backtest force-closes the last open position",
    run: runBacktestFinalCloseTests
  },
  {
    name: "candle windowing keeps short ranges in one window",
    run: runSingleWindowTests
  },
  {
    name: "candle windowing splits long ranges contiguously",
    run: runMultiWindowTests
  }
];

let passed = 0;

for (const testCase of testCases) {
  try {
    testCase.run();
    passed += 1;
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    console.error(`FAIL ${testCase.name}`);
    throw error;
  }
}

console.log(`API test suite passed: ${passed}/${testCases.length}`);
