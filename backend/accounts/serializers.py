from rest_framework import serializers
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "role", "is_active")


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.is_active:
            raise AuthenticationFailed("No active account found with the given credentials")
        return {"access_token": data["access"], "user": UserSerializer(self.user).data}


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
