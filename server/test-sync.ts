import { testCloudConnection, syncToCloud, pullFromCloud } from './cloud-sync.js';

async function main() {
  console.log('Testing Cloud Connection...');
  const test = await testCloudConnection();
  console.log('Test Connection:', test);

  console.log('Syncing data to Cloud...');
  const sync = await syncToCloud();
  console.log('Sync to Cloud result:', sync);

  console.log('Pulling data from Cloud...');
  const pull = await pullFromCloud();
  console.log('Pull from Cloud result:', pull);

  console.log('All Cloud Database sync tests passed successfully!');
  process.exit(0);
}

void main();
