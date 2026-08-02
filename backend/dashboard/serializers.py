from rest_framework import serializers


class AccountCountsSerializer(serializers.Serializer):
    admins = serializers.IntegerField()
    teachers = serializers.IntegerField()
    students = serializers.IntegerField()


class AdminDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    accounts = AccountCountsSerializer()
