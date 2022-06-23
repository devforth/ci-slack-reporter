// my-reporter.js

'use strict';

const Mocha = require('mocha');
const { IncomingWebhook } = require('@slack/webhook');

const {
  EVENT_RUN_BEGIN,
  EVENT_RUN_END,
  EVENT_TEST_FAIL,
  EVENT_TEST_PASS,
  EVENT_SUITE_BEGIN,
  EVENT_SUITE_END
} = Mocha.Runner.constants;

if (!process.env.CI_SLACK_REPORTER_WEBHOOK) {
  console.error('CI_SLACK_REPORTER_WEBHOOK env variable is not set, reported will not work, please do export CI_SLACK_REPORTER_WEBHOOK=...')
}

const webhook = new IncomingWebhook(process.env.CI_SLACK_REPORTER_WEBHOOK);

let out;

// this reporter outputs test results, indenting two spaces per suite
class MyReporter {
  constructor(runner) {
    this._indents = 0;
    const stats = runner.stats;

    runner
      .once(EVENT_RUN_BEGIN, () => {
        out = '';
      })
      .on(EVENT_SUITE_BEGIN, () => {
        this.increaseIndent();
      })
      .on(EVENT_SUITE_END, () => {
        this.decreaseIndent();
      })
      .on(EVENT_TEST_PASS, test => {
        // Test#fullTitle() returns the suite name(s)
        // prepended to the test title
        out += `${this.indent()} ✅ ${test.fullTitle()}\n`;
      })
      .on(EVENT_TEST_FAIL, (test, err) => {
        out += `${this.indent()} ⛔ ${test.fullTitle()} - error: ${err.message}\n`;
      })
      .once(EVENT_RUN_END, () => {
        out += `Test finished. ${stats.passes}/${stats.passes + stats.failures} ok`;
        webhook.send({
          text: out,
        })
      });
  }

  indent() {
    return Array(this._indents).join('  ');
  }

  increaseIndent() {
    this._indents++;
  }

  decreaseIndent() {
    this._indents--;
  }
}

module.exports = MyReporter;