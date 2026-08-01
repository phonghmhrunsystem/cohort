from django.urls import path

from .views import AssignmentMyResultView, AssignmentStudentResultView, SubmissionGradeView


urlpatterns = [
    path("submissions/<int:submission_id>/grade", SubmissionGradeView.as_view()),
    path("assignments/<int:assignment_id>/my-result", AssignmentMyResultView.as_view()),
    path(
        "assignments/<int:assignment_id>/students/<int:student_id>/result",
        AssignmentStudentResultView.as_view(),
    ),
]
