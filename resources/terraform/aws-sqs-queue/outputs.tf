output "arn" {
  value       = aws_sqs_queue.queue.arn
  description = "the arn of the queue"
}
output "id" {
  value       = aws_sqs_queue.queue.id
  description = "the id of the queue"
}
output "dlq_arn" {
  value       = aws_sqs_queue.dead_letter_queue.arn
  description = "the arn of the dead letter queue"
}
output "dlq_id" {
  value       = aws_sqs_queue.dead_letter_queue.id
  description = "the id of the dead letter queue"
}
output "dlq_name" {
  value       = aws_sqs_queue.dead_letter_queue.name
  description = "the name of the dead letter queue"
}
