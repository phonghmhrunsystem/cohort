from django.urls import path

from .views import AssignmentMyResultView, SubmissionGradeView


urlpatterns = [
    path("submissions/<int:submission_id>/grade", SubmissionGradeView.as_view()),
    path("assignments/<int:assignment_id>/my-result", AssignmentMyResultView.as_view()),
]
