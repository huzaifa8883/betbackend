from datetime import datetime
from bson import ObjectId
import json

class BaseModel:
    """
    BaseModel: A foundational class for all MongoDB models.
    Provides common fields like _id, created_at, and updated_at.
    """

    def __init__(self, _id=None, created_at=None, updated_at=None):
        self._id = _id or ObjectId()
        self.created_at = created_at or datetime.utcnow()
        self.updated_at = updated_at or datetime.utcnow()

    def touch(self):
        """Update the updated_at timestamp to current time."""
        self.updated_at = datetime.utcnow()

    def to_dict(self):
        """Convert model fields to a dictionary format."""
        return {
            "_id": str(self._id),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def to_json(self):
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), default=str)

    def __str__(self):
        return f"<{self.__class__.__name__} id={self._id}>"

    def __repr__(self):
        return self.__str__()

    @staticmethod
    def parse_object_id(oid):
        """Parse and return a valid ObjectId or the raw value if invalid."""
        if isinstance(oid, ObjectId):
            return oid
        try:
            return ObjectId(oid)
        except Exception:
            return oid

    @classmethod
    def from_dict(cls, data):
        """
        Initialize a model from a dictionary.
        Useful when retrieving from MongoDB.
        """
        return cls(
            _id=cls.parse_object_id(data.get("_id")),
            created_at=data.get("created_at", datetime.utcnow()),
            updated_at=data.get("updated_at", datetime.utcnow()),
        )

    def update_from_dict(self, data):
        """Update fields from dictionary values."""
        if 'created_at' in data:
            self.created_at = data['created_at']
        if 'updated_at' in data:
            self.updated_at = data['updated_at']
        if '_id' in data:
            self._id = self.parse_object_id(data['_id'])

    def has_id(self):
        """Check if the model has a valid MongoDB ObjectId."""
        return isinstance(self._id, ObjectId)

    def created_before(self, dt: datetime):
        """Check if the document was created before a specific datetime."""
        return self.created_at < dt

    def updated_recently(self, minutes=5):
        """Check if the document was updated in the last `minutes`."""
        return (datetime.utcnow() - self.updated_at).total_seconds() < (minutes * 60)

    def is_valid(self):
        """Basic validation - can be extended by subclasses."""
        return isinstance(self._id, ObjectId)

    def export_fields(self, fields: list):
        """Export only selected fields."""
        data = self.to_dict()
        return {key: data[key] for key in fields if key in data}

    def refresh_timestamps(self):
        """Reset both created_at and updated_at to now."""
        now = datetime.utcnow()
        self.created_at = now
        self.updated_at = now

    def is_equal(self, other):
        """Compare with another BaseModel by ID."""
        return isinstance(other, BaseModel) and self._id == other._id

    def debug_print(self):
        """Print internal data for debugging."""
        print(f"ID: {self._id}")
        print(f"Created At: {self.created_at}")
        print(f"Updated At: {self.updated_at}")

# Example usage:
if __name__ == "__main__":
    model = BaseModel()
    print("To Dict:", model.to_dict())
    print("To JSON:", model.to_json())
    model.touch()
    print("Updated Timestamp:", model.updated_at)
