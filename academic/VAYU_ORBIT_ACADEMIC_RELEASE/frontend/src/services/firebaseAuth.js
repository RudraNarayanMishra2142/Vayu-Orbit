import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { firebaseApp } from './firebase';

// Initialize Firebase Authentication once as singleton
export const auth = getAuth(firebaseApp);

// Configure session persistence (operator session expires on browser tab/window closure)
try {
  setPersistence(auth, browserSessionPersistence).catch((err) => {
    console.warn('Firebase auth persistence configuration notice:', err.message);
  });
} catch (e) {
  console.warn('Firebase setPersistence deferred:', e);
}

/**
 * Format Firebase Auth errors into clear, operational messages
 */
export function formatAuthError(error) {
  if (!error) return 'Authentication failed. Please verify your credentials.';
  const code = error.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid operator email or password. Verify your credentials.';
    case 'auth/invalid-email':
      return 'Please enter a valid operator email address.';
    case 'auth/user-disabled':
      return 'This operator account has been deactivated. Contact your system administrator.';
    case 'auth/too-many-requests':
      return 'Access temporarily blocked due to multiple failed attempts. Please wait a few moments before trying again.';
    case 'auth/network-request-failed':
      return 'Network connection failure. Unable to contact Firebase identity server.';
    case 'auth/requires-recent-login':
      return 'Security timeout. Please sign in again to perform this operation.';
    case 'auth/api-key-not-valid':
    case 'auth/invalid-api-key':
      return 'Firebase Web API key is invalid or unconfigured. Verify your VITE_FIREBASE_API_KEY environment variable.';
    case 'auth/app-deleted':
      return 'Firebase app instance was deleted. Please refresh the page.';
    case 'auth/expired-action-code':
      return 'The password reset link has expired. Please request a new one.';
    case 'auth/invalid-action-code':
      return 'The password reset link is invalid or has already been used.';
    default:
      return error.message || 'Authentication error. Please contact logistics command.';
  }
}

/**
 * Authenticate with Firebase using Email and Password
 */
export async function loginWithFirebase(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const idToken = await userCredential.user.getIdToken();
    return {
      user: userCredential.user,
      idToken
    };
  } catch (error) {
    const friendlyMessage = formatAuthError(error);
    const err = new Error(friendlyMessage);
    err.code = error.code;
    err.original = error;
    throw err;
  }
}

/**
 * Sign out from Firebase
 */
export async function logoutFromFirebase() {
  try {
    await signOut(auth);
  } catch (error) {
    console.warn('Firebase signOut notice:', error.message);
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email) {
  if (!email || !email.trim()) {
    throw new Error('Please enter your operator email address to receive password reset instructions.');
  }
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { ok: true, message: 'Password reset link dispatched. Please check your inbox.' };
  } catch (error) {
    const friendlyMessage = formatAuthError(error);
    const err = new Error(friendlyMessage);
    err.code = error.code;
    throw err;
  }
}

/**
 * Acquire current active Firebase ID token with optional force refresh
 */
export async function getFirebaseIdToken(forceRefresh = false) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return null;
    }
    return await currentUser.getIdToken(forceRefresh);
  } catch (error) {
    console.warn('Error acquiring Firebase ID token:', error.message);
    return null;
  }
}

/**
 * Subscribe to Firebase Auth state changes
 */
export function subscribeToAuthChanges(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get currently logged-in Firebase user
 */
export function getCurrentFirebaseUser() {
  return auth.currentUser;
}
