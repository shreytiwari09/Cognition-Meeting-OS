"""A tiny in-memory stand-in for Firestore, just enough for the routes under test."""
import copy
from firebase_admin import firestore as admin_firestore


class Snap:
    def __init__(self, path, data):
        self.id, self._data = path.rsplit('/', 1)[-1], data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return copy.deepcopy(self._data)


def _apply(doc, updates):
    for key, value in updates.items():
        if value is admin_firestore.DELETE_FIELD:
            doc.pop(key, None)
        elif isinstance(value, admin_firestore.Increment):
            doc[key] = doc.get(key, 0) + value.value
        elif isinstance(value, admin_firestore.ArrayUnion):
            doc[key] = sorted(set(doc.get(key, [])) | set(value.values))
        else:
            doc[key] = value


class Query:
    def __init__(self, db, prefix, filters=(), order=None, max_results=None):
        self.db, self.prefix, self.filters, self.order, self.max_results = db, prefix, list(filters), order, max_results

    def where(self, field, op, value):
        return Query(self.db, self.prefix, self.filters + [(field, op, value)], self.order, self.max_results)

    def limit(self, n):
        return Query(self.db, self.prefix, self.filters, self.order, n)

    def order_by(self, field):
        return Query(self.db, self.prefix, self.filters, field, self.max_results)

    def _match(self, data):
        for field, op, value in self.filters:
            have = data.get(field)
            if op == '==' and have != value:
                return False
            if op == 'array_contains' and value not in (have or []):
                return False
            if op == 'in' and have not in value:
                return False
        return True

    def stream(self):
        rows = []
        for path, data in self.db.data.items():
            rest = path[len(self.prefix) + 1:] if path.startswith(self.prefix + '/') else None
            if rest and '/' not in rest and self._match(data):
                rows.append((path, data))
        if self.order:
            rows.sort(key=lambda r: r[1].get(self.order))
        if self.max_results:
            rows = rows[:self.max_results]
        return iter([Snap(p, d) for p, d in rows])


class Col(Query):
    def document(self, doc_id):
        return Doc(self.db, f"{self.prefix}/{doc_id}")


class Doc:
    def __init__(self, db, path):
        self.db, self.path = db, path
        self.id = path.rsplit('/', 1)[-1]

    def collection(self, name):
        return Col(self.db, f"{self.path}/{name}")

    def get(self):
        return Snap(self.path, self.db.data.get(self.path))

    def set(self, data):
        self.db.data[self.path] = copy.deepcopy(data)

    def update(self, updates):
        if self.path not in self.db.data:
            raise KeyError(f"No document to update: {self.path}")
        _apply(self.db.data[self.path], updates)

    def delete(self):
        self.db.data.pop(self.path, None)


class FakeDb:
    def __init__(self, data=None):
        self.data = copy.deepcopy(data or {})

    def collection(self, name):
        return Col(self, name)

    def doc(self, path):
        return Doc(self, path)
