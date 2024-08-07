import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  FirebaseStorage,
  getDownloadURL,
  getStorage,
  ref,
  StorageReference,
  uploadBytes,
} from "firebase/storage";
import fs from "node:fs";
import path from "node:path";
import { EnvVars } from "../types";

export type FirebaseStorageInfo = {
  storage: FirebaseStorage;
  uid: string;
};

export type FirebaseFileInfo = {
  storageRef: StorageReference;
  downloadUrl: string;
};

export async function initFirebase(
  envVars: EnvVars,
): Promise<FirebaseStorageInfo> {
  // initializeApp({
  //   apiKey: "AIza....",                             // Auth / General Use
  //   authDomain: "YOUR_APP.firebaseapp.com",         // Auth with popup/redirect
  //   databaseURL: "https://YOUR_APP.firebaseio.com", // Realtime Database
  //   storageBucket: "YOUR_APP.appspot.com",          // Storage
  //   messagingSenderId: "123456789"                  // Cloud Messaging
  // });
  const app = initializeApp({
    apiKey: envVars.firebaseApiKey,
    storageBucket: envVars.firebaseStorageBucket,
  });
  const storage = getStorage(app);
  const auth = getAuth(app);

  return signInWithEmailAndPassword(
    auth,
    envVars.firebaseEmail,
    envVars.firebasePassword,
  )
    .then((res) => {
      const uid = res.user.uid;
      return {
        storage,
        uid,
      };
    })
    .catch(() => {
      throw new Error(`Failed sign in with Firebase`);
    });
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
): Promise<FirebaseFileInfo> {
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
