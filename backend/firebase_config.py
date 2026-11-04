import firebase_admin
from firebase_admin import credentials, firestore
import os, json

def init_firebase():
    if not firebase_admin._apps:
        key_str = os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY')
        if key_str:
            cred = credentials.Certificate(json.loads(key_str))
        else:
            cred = credentials.Certificate('firebase-service-account.json')
        firebase_admin.initialize_app(cred)
    return firestore.client()

db = init_firebase()
