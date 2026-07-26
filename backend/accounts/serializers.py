from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "role", "is_active")


class UserCreateSerializer(UserSerializer):
    password = serializers.CharField(write_only=True)

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ("password",)


class UserUpdateSerializer(UserSerializer):
    class Meta(UserSerializer.Meta):
        extra_kwargs = {field: {"required": False} for field in UserSerializer.Meta.fields}

    def validate(self, attrs):
        allowed_fields = {"email", "role", "is_active"}
        unknown_fields = set(self.initial_data) - allowed_fields
        if unknown_fields:
            raise serializers.ValidationError(
                {field: "This field cannot be updated." for field in unknown_fields}
            )
        if not attrs or all(getattr(self.instance, field) == value for field, value in attrs.items()):
            raise serializers.ValidationError("Provide a changed account field.")
        return attrs
