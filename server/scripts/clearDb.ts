import mongoose from 'mongoose';
import { config } from '../config';

async function clearDatabase() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.MONGODB_URI);

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection instance not available.');
  }

  console.log(`Connected to database: "${db.databaseName}" on host "${mongoose.connection.host}"\n`);

  const collections = await db.collections();
  if (collections.length === 0) {
    console.log('No collections found in database.');
  } else {
    for (const collection of collections) {
      const count = await collection.countDocuments();
      await collection.deleteMany({});
      console.log(`✓ Cleared collection "${collection.collectionName}" (${count} documents removed)`);
    }
  }

  console.log('\nAll MongoDB data cleared successfully.');
  await mongoose.disconnect();
  process.exit(0);
}

clearDatabase().catch((err) => {
  console.error('\nError clearing database:', err);
  process.exit(1);
});
