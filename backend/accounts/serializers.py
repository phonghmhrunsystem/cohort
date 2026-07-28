import re
from datetime import date

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "full_name", "email", "role", "phone", "date_of_birth", "gender", "address", "is_active", "must_change_password")
        read_only_fields = ("id", "is_active")


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        user = UserSerializer(self.user).data
        user["must_change_password"] = self.user.must_change_password
        return {"access_token": data["access"], "user": user}


class ProfileValidationMixin:
    def validate_full_name(self, value):
        value = value.strip()
        if not 2 <= len(value) <= 100:
            raise serializers.ValidationError("Use 2 to 100 characters.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        users = User.objects.filter(email__iexact=value)
        if self.instance:
            users = users.exclude(pk=self.instance.pk)
        if users.exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_phone(self, value):
        value = value.strip()
        if not value:
            return None
        if not re.fullmatch(r"\+?\d{9,15}", value):
            raise serializers.ValidationError("Use 9 to 15 digits with an optional leading +.")
        return value

    def validate_date_of_birth(self, value):
        if value and value >= date.today():
            raise serializers.ValidationError("Date of birth must be in the past.")
        return value

    def validate_address(self, value):
        return value.strip() or None


class UserCreateSerializer(ProfileValidationMixin, serializers.ModelSerializer):
    full_name = serializers.CharField(min_length=2, max_length=100)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    role = serializers.ChoiceField(choices=(User.Role.TEACHER, User.Role.STUDENT))
    phone = serializers.CharField(required=False, allow_blank=True, max_length=16)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.ChoiceField(choices=("NAM", "NU", "KHAC"), required=False, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True, max_length=255)

    class Meta:
        model = User
        fields = ("id", "full_name", "email", "password", "role", "phone", "date_of_birth", "gender", "address")
        read_only_fields = ("id",)

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class UserUpdateSerializer(ProfileValidationMixin, serializers.ModelSerializer):
    full_name = serializers.CharField(required=False, min_length=2, max_length=100)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=16)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.ChoiceField(choices=("NAM", "NU", "KHAC"), required=False, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True, max_length=255)
    class Meta:
        model = User
        fields = ("full_name", "phone", "date_of_birth", "gender", "address")

    def validate(self, attrs):
        allowed_fields = {"full_name", "phone", "date_of_birth", "gender", "address"}
        unknown_fields = set(self.initial_data) - allowed_fields
        if unknown_fields:
            raise serializers.ValidationError(
                {field: "This field cannot be updated." for field in unknown_fields}
            )
        if not attrs or all(getattr(self.instance, field) == value for field, value in attrs.items()):
            raise serializers.ValidationError("Provide a changed account field.")
        return attrs


class SelfProfileSerializer(UserUpdateSerializer):
    pass


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=8, max_length=128)

    def validate(self, attrs):
        allowed_fields = {"current_password", "new_password"}
        unknown_fields = set(self.initial_data) - allowed_fields
        if unknown_fields:
            raise serializers.ValidationError(
                {field: "This field cannot be updated." for field in unknown_fields}
            )
        if not self.instance.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetResolveSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=8, max_length=128)
