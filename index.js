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
const fails_only_webhook = process.env.CI_SLACK_REPORTER_FAILS_ONLY_WEBHOOK && new IncomingWebhook(process.env.CI_SLACK_REPORTER_FAILS_ONLY_WEBHOOK);

const webhook = new IncomingWebhook(process.env.CI_SLACK_REPORTER_WEBHOOK);

let out = {};

const SLACK_BLOCKS_LIMIT = 50;
function splitIfBlocksLimit(obj) {
  const res = [];
  while (obj.attachments[0].blocks.length != 0) {
    const deepClone = JSON.parse(JSON.stringify(obj))
    deepClone.attachments[0].blocks = deepClone.attachments[0].blocks.slice(0, SLACK_BLOCKS_LIMIT); 
    obj.attachments[0].blocks.splice(0, SLACK_BLOCKS_LIMIT);
    res.push(deepClone);
  }
  return res;

}

// this reporter outputs test results, indenting two spaces per suite
class MyReporter {
  constructor(runner) {
    this._indents = 0;
    const stats = runner.stats;
    const filename = runner.suite?.file;

    runner
      .once(EVENT_RUN_BEGIN, () => {
        console.log(`⚡runner ${filename}`);
        
        out[filename] = {
          attachments: [
            {
              "color": "#ff0000",
              "blocks": [
                {
                  "type": "header",
                  "text": {
                    "type": "plain_text",
                    "text": "Tests finished. 2/3",
                    "emoji": true
                  }
                },
                {
                  "type": "divider"
                },
              ]
            }
          ]
        };
        if (process.env.CI_SLACK_REPORTER_ICON_URL) {
          out[filename].icon_url = process.env.CI_SLACK_REPORTER_ICON_URL;
        } else {
          out[filename].icon_emoji = ":robot:"
        }

        out[filename].username = process.env.CI_SLACK_REPORTER_USERNAME || 'Autotester'

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
        out[filename].attachments[0].blocks.push({
					"type": "section",
					"text": {
						"type": "plain_text",
						"text": `${out[filename].attachments[0].blocks.length - 1} - :white_check_mark: ${test.fullTitle()}`,
						"emoji": true
					}
				})
      })
      .on(EVENT_TEST_FAIL, (test, err) => {
        out[filename].attachments[0].blocks.push({
					"type": "section",
					"text": {
						"type": "plain_text",
						"text": `${out[filename].attachments[0].blocks.length - 1} - :no_entry: ${test.fullTitle()} - error: \`${err.message}\``,
						"emoji": true
					}
				})
      })
      .once(EVENT_RUN_END, () => {
        if (process.env.CI_SLACK_REPORTER_VIDEO_URL && stats.failures) {
          out[filename].attachments[0].blocks[2].accessory = {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": "Watch video",
              "emoji": true
            },
            "value": "click_me_123",
            "url": process.env.CI_SLACK_REPORTER_VIDEO_URL,
            "action_id": "button-action"
          }
        }

        out[filename].attachments[0].blocks[0].text.text = `Tests finished ${stats.passes}/${stats.passes + stats.failures}`;
        out[filename].attachments[0].color = stats.failures ? "#a30200" : "#2eb886";
        (async () => {
          for (const part of splitIfBlocksLimit(out[filename])) {
            await webhook.send(part);
          };
        })();
        

        if (stats.failures) {
          out[filename].attachments[0].blocks = out[filename].attachments[0].blocks.filter(el => {
            return !el?.text?.text?.startsWith(":white")
          })
          splitIfBlocksLimit(out[filename]).forEach((part) => {
            fails_only_webhook?.send(part);
          });
	      }
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
