from app import app

print("Registered Routes:")
print("-----------------")

for rule in sorted(app.url_map.iter_rules(), key=lambda x: str(x)):
    print(f"{rule.endpoint:50s} {', '.join(rule.methods - {'HEAD', 'OPTIONS'}):20s} {rule}")

print("\nBlueprints:")
print("-----------")
for name, blueprint in app.blueprints.items():
    print(f"{name:30s} {blueprint.url_prefix or '/'}")
