/**
 * MinIO Bucket Initialization via Docker
 * Creates required buckets using MinIO client in Docker
 */

const { execSync } = require('child_process');

const buckets = ['oxsig', 'oxsig-backups'];

function execCommand(command, silent = false) {
  try {
    const result = execSync(command, { encoding: 'utf-8', stdio: silent ? 'pipe' : 'inherit' });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function createBucket(bucketName) {
  console.log(`Creating bucket '${bucketName}'...`);
  
  // Use Docker to run MinIO client commands
  const command = `docker exec oxsig-minio sh -c "mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb local/${bucketName} --ignore-existing && mc anonymous set download local/${bucketName}"`;
  
  const result = execCommand(command, true);
  
  if (result.success || (result.error && result.error.includes('already exists'))) {
    console.log(`✅ Bucket '${bucketName}' ready`);
    return true;
  } else {
    console.error(`❌ Failed to create bucket '${bucketName}'`);
    return false;
  }
}

async function main() {
  console.log('🪣 Creating MinIO buckets...\n');

  for (const bucket of buckets) {
    try {
      await createBucket(bucket);
    } catch (error) {
      console.error(`Failed to create ${bucket}:`, error.message);
    }
  }

  console.log('\n✅ MinIO initialization complete!');
  console.log(`\n📦 Access MinIO Console: http://localhost:9001`);
  console.log(`   Username: minioadmin`);
  console.log(`   Password: minioadmin\n`);
}

main().catch(console.error);
