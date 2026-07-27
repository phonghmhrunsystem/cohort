from django.urls import path

from .views import AssignmentDetailView, AssignmentRubricView, ClassAssignmentsView


urlpatterns = [
    path("classes/<int:class_id>/assignments", ClassAssignmentsView.as_view()),
    path("assignments/<int:assignment_id>", AssignmentDetailView.as_view()),
    path("assignments/<int:assignment_id>/rubric", AssignmentRubricView.as_view()),
]
