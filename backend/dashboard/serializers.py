from rest_framework import serializers


class AccountCountsSerializer(serializers.Serializer):
    admins = serializers.IntegerField()
    teachers = serializers.IntegerField()
    students = serializers.IntegerField()


class ClassBucketsSerializer(serializers.Serializer):
    running = serializers.IntegerField()
    scheduled = serializers.IntegerField()
    ended = serializers.IntegerField()
    disabled = serializers.IntegerField()


class AuditActorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField(allow_null=True)
    role = serializers.CharField()


class RecentAuditSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    action = serializers.CharField()
    target_label = serializers.CharField(allow_blank=True)
    actor = AuditActorSerializer()
    created_at = serializers.DateTimeField()


class AdminDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    accounts = AccountCountsSerializer()
    classes = ClassBucketsSerializer()
    recent_audit = RecentAuditSerializer(many=True)


class TeacherCardsSerializer(serializers.Serializer):
    my_classes = serializers.IntegerField()
    running_classes = serializers.IntegerField()
    open_assignments = serializers.IntegerField()
    pending_grading = serializers.IntegerField()
    students = serializers.IntegerField()


class TeacherDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    cards = TeacherCardsSerializer()
