import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Function } from 'aws-cdk-lib/aws-lambda';

import { Construct } from 'constructs';

interface EventBridgeResourcesProps {
  insightQueryLambda: Function;
}
export class EventBridgeResources extends Construct {
  constructor(scope: Construct, id: string, props: EventBridgeResourcesProps) {
    super(scope, id);

    new Rule(this, 'DailyLambdaTrigger', {
      schedule: Schedule.cron({ minute: '0', hour: '0' }),
      targets: [new LambdaFunction(props.insightQueryLambda)],
    });
  }
}
