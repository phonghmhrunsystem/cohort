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
