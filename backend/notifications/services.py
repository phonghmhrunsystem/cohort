from .models import Notification


def create_notifications(classroom, type, title, link):
    Notification.objects.bulk_create([
        Notification(recipient_id=student_id, type=type, title=title, link=link)
        for student_id in classroom.enrollments.values_list("student_id", flat=True)
    ])


def notify_user(user, type, title, link):
    Notification.objects.create(recipient=user, type=type, title=title, link=link)
