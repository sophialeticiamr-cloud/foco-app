/*
  COLE A configuração do seu projeto Firebase aqui.

  1. Crie um projeto no Firebase.
  2. Adicione um aplicativo Web.
  3. Ative Authentication > Sign-in method > Anonymous.
  4. Crie o Realtime Database.
  5. Cole abaixo o objeto firebaseConfig fornecido pelo Firebase.
  6. Troque FIREBASE_ENABLED para true.

  O restante do aplicativo funciona sem Firebase usando localStorage.
*/

export const FIREBASE_ENABLED = false;

export const FIREBASE_CONFIG = {
  apiKey: "COLE_SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};
