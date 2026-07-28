from django.urls import path

from .views import AssignmentSubmissionsView, SubmissionDetailView, SubmissionDownloadView


urlpatterns = [
    path("assignments/<int:assignment_id>/submissions", AssignmentSubmissionsView.as_view()),
    path("submissions/<int:submission_id>", SubmissionDetailView.as_view()),
    path("submissions/<int:submission_id>/download", SubmissionDownloadView.as_view()),
]
