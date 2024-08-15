import { Duration, Stack } from 'aws-cdk-lib';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Function, Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface LambdaResourcesProps {
  logLevel: string;
  insightsBucket: Bucket;
  githubTokenSecretName: string;
}
export class LambdaResources extends Construct {
  public insightQueryLambda: Function;

  constructor(scope: Construct, id: string, props: LambdaResourcesProps) {
    super(scope, id);

    const insightQueryLambdaRole = new Role(this, 'insightQueryLambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    const githubTokenSecret = Secret.fromSecretPartialArn(
      this,
      'githubTokenSecret',
      `arn:aws:secretsmanager:${Stack.of(this).region}:${
        Stack.of(this).account
      }:secret:${props.githubTokenSecretName}`,
    );

    githubTokenSecret.grantRead(insightQueryLambdaRole);

    this.insightQueryLambda = new NodejsFunction(this, 'InsightsQueryLambda', {
      entry: './src/resources/insightQuery/index.ts',
      runtime: Runtime.NODEJS_LATEST,
      architecture: Architecture.ARM_64,
      memorySize: 1024,
      handler: 'handler',
      timeout: Duration.minutes(5),
      role: insightQueryLambdaRole,
      environment: {
        LOG_LEVEL: props.logLevel,
        GITHUB_TOKEN_SECRET_NAME: props.githubTokenSecretName,
        INSIGHTS_BUCKET: props.insightsBucket.bucketName,
      },
    });

    props.insightsBucket.grantReadWrite(this.insightQueryLambda);
  }
}
