/**
 * Firebase Realtime Database Configuration
 *
 * Setup Instructions:
 * 1. Go to https://console.firebase.google.com/
 * 2. Click "Create a project" (or use an existing one)
 * 3. In the project, navigate to "Build" > "Realtime Database" > "Create Database"
 * 4. Choose a region, select "Start in test mode" (or set rules manually)
 * 5. Set the security rules to allow read/write:
 *    {
 *      "rules": {
 *        ".read": true,
 *        ".write": true
 *      }
 *    }
 * 6. Copy your database URL from the top of the Realtime Database page
 *    (looks like: https://your-project-id.firebaseio.com or
 *     https://your-project-id.region.firebasedatabase.app)
 * 7. Paste it below between the quotes:
 */

window.FIREBASE_DB_URL = 'https://ai3d-model-eval-default-rtdb.firebaseio.com/';  // <-- PASTE YOUR DATABASE URL HERE

/**
 * Admin Password Configuration
 *
 * Only the admin (who knows this password) can delete models from the library.
 * Regular users can browse, view details, and download — but cannot delete.
 *
 * To change the password, simply edit the string below.
 */
window.ADMIN_PASSWORD = 'admin913';  // <-- Change this to your own password
