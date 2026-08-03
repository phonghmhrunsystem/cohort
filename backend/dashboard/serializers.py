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


class StudentRefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField(allow_null=True)


class PendingRowSerializer(serializers.Serializer):
    submission_id = serializers.IntegerField()
    assignment_id = serializers.IntegerField()
    assignment_title = serializers.CharField()
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    student = StudentRefSerializer()
    submitted_at = serializers.DateTimeField()


class DueSoonRowSerializer(serializers.Serializer):
    assignment_id = serializers.IntegerField()
    title = serializers.CharField()
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    due_at = serializers.DateTimeField()
    submitted_count = serializers.IntegerField()
    student_count = serializers.IntegerField()


class TeacherDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    cards = TeacherCardsSerializer()
    pending = PendingRowSerializer(many=True)
    due_soon = DueSoonRowSerializer(many=True)


class StudentCardsSerializer(serializers.Serializer):
    my_classes = serializers.IntegerField()
    not_submitted = serializers.IntegerField()
    graded = serializers.IntegerField()
    average_score = serializers.FloatField(allow_null=True)


class TodoRowSerializer(serializers.Serializer):
    assignment_id = serializers.IntegerField()
    title = serializers.CharField()
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    due_at = serializers.DateTimeField()


class RecentGradeSerializer(serializers.Serializer):
    assignment_id = serializers.IntegerField()
    title = serializers.CharField()
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    score = serializers.IntegerField()
    maximum_score = serializers.IntegerField()
    graded_at = serializers.DateTimeField()


class StudentDashboardSerializer(serializers.Serializer):
    role = serializers.CharField()
    cards = StudentCardsSerializer()
    todo = TodoRowSerializer(many=True)
    recent_grades = RecentGradeSerializer(many=True)
