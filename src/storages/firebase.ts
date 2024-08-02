import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  FirebaseStorage,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";
import fs from "node:fs";
import path from "node:path";
import { Config, EnvVars } from "../types";

export async function initFirebase(envVars: EnvVars, userConfig: Config) {
  // initializeApp({
  //   apiKey: "AIza....",                             // Auth / General Use
  //   authDomain: "YOUR_APP.firebaseapp.com",         // Auth with popup/redirect
  //   databaseURL: "https://YOUR_APP.firebaseio.com", // Realtime Database
  //   storageBucket: "YOUR_APP.appspot.com",          // Storage
  //   messagingSenderId: "123456789"                  // Cloud Messaging
  // });
  const app = initializeApp({
    apiKey: envVars.firebaseApiKey,
    ...userConfig.firebase.options,
  });
  const storage = getStorage(app);
  const auth = getAuth(app);

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      envVars.firebaseEmail,
      envVars.firebasePassword,
    );
    const firebaseUid = userCredential.user.uid;
    return { storage, firebaseUid };
  } catch (e) {
    throw new Error(`Failed sign in with Firebase \n${e}`);
  }
}

/**
 * Upload file to Firebase Storage. A user ID is required to access control.
 * @param storage - Firebase storage object
 * @param uid - Firebase user id. Need for authenticating access.
 * @param filePath - file to upload
 * @returns storageRef, downloadUrl
 */
export async function uploadFirebase(
  storage: FirebaseStorage,
  uid: string,
  filePath: string,
) {
  const fileContent = fs.readFileSync(filePath);
  const parentFolderPath = path.basename(path.dirname(filePath));
  const storageRef = ref(
    storage,
    `user/${uid}/${parentFolderPath}/${path.basename(filePath)}`,
  );
  const snapshot = await uploadBytes(storageRef, fileContent);
  const downloadUrl = await getDownloadURL(snapshot.ref);
  return { storageRef, downloadUrl };
}
