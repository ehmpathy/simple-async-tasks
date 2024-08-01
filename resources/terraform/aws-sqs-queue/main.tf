locals {
  name = "${var.service}-${var.environment}-${var.title}"
}

resource "aws_sqs_queue" "dead_letter_queue" {    # define the deadletter queue
  name                      = "${local.name}-dlq" # https://en.wikipedia.org/wiki/Dead_letter_queue
  message_retention_seconds = 14 * 24 * 60 * 60   # keep a message up to 14 days in the deadletter queue, the max amount of time permitted
  tags                      = var.tags
}
resource "aws_sqs_queue" "queue" {                 # define the queeu
  name                       = "${local.name}-llq" # live letter queue
  visibility_timeout_seconds = var.visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds # keep a message up to 3 days in the queue
  delay_seconds              = var.delay_seconds             # wait 15 seconds before reading messages
  redrive_policy = jsonencode({
    maxReceiveCount     = var.max_receive_count
    deadLetterTargetArn = aws_sqs_queue.dead_letter_queue.arn # and if feailed each time, send here
  })
  tags = var.tags
}
