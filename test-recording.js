#!/usr/bin/env node

import fetch from 'node-fetch';

const BACKEND_URL = 'http://localhost:5000';
const VPS_URL = 'http://147.93.119.85:3000';

const tests = {
  async checkBackendHealth() {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      const data = await response.json();
      console.log('✅ Backend health:', data.status);
      return true;
    } catch (error) {
      console.log('❌ Backend offline:', error.message);
      return false;
    }
  },

  async checkVpsHealth() {
    try {
      const response = await fetch(`${VPS_URL}/health`);
      const data = await response.json();
      console.log('✅ VPS health:', data.status, `- Active bots: ${data.activeBots}`);
      return true;
    } catch (error) {
      console.log('❌ VPS offline:', error.message);
      return false;
    }
  },

  async testWebhook() {
    try {
      const webhook = {
        event: 'meeting.started',
        payload: {
          object: {
            id: `test-${Date.now()}`,
            topic: 'Test Recording Meeting',
            host_id: 'test-user-id',
            password: ''
          }
        }
      };

      const response = await fetch(`${BACKEND_URL}/api/webhooks/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhook)
      });

      const result = await response.json();
      if (result.success) {
        console.log('✅ Webhook test passed:', result.message);
        return result;
      } else {
        console.log('❌ Webhook test failed:', result.error);
        return false;
      }
    } catch (error) {
      console.log('❌ Webhook error:', error.message);
      return false;
    }
  },

  async testRecordingUpload() {
    try {
      const FormData = (await import('form-data')).default;
      const fs = (await import('fs')).default;
      
      const testFile = 'test-audio.webm';
      fs.writeFileSync(testFile, 'test audio content');

      const form = new FormData();
      form.append('recording', fs.createReadStream(testFile));
      form.append('duration', '60');

      const response = await fetch(`${BACKEND_URL}/api/recordings/upload/test-meeting`, {
        method: 'POST',
        body: form
      });

      const result = await response.json();
      fs.unlinkSync(testFile);

      if (result.success) {
        console.log('✅ Upload test passed:', result.message);
        return true;
      } else {
        console.log('❌ Upload test failed:', result.error);
        return false;
      }
    } catch (error) {
      console.log('❌ Upload error:', error.message);
      return false;
    }
  }
};

async function runTests() {
  console.log('🧪 Testing Recording System...\n');

  const results = {
    backend: await tests.checkBackendHealth(),
    vps: await tests.checkVpsHealth(),
    webhook: await tests.testWebhook(),
    upload: await tests.testRecordingUpload()
  };

  console.log('\n📊 Test Results:');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
  });

  const allPassed = Object.values(results).every(Boolean);
  console.log(`\n${allPassed ? '🎉' : '⚠️'} Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

  if (allPassed) {
    console.log('\n🚀 Recording system is ready for production!');
  } else {
    console.log('\n🔧 Fix the failing components before proceeding.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export default tests; 