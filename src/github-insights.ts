import { App, CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { config } from 'dotenv';
import {
  LambdaResources,
  S3Resources,
  EventBridgeResources,
  AthenaResources,
  GlueResources,
} from '.';
config();

interface GitHubInsightsProps extends StackProps {
  logLevel: string;
  githubTokenSecretName: string;
}

export class GitHubInsights extends Stack {
  constructor(scope: Construct, id: string, props: GitHubInsightsProps) {
    super(scope, id, props);

    const s3Resources = new S3Resources(this, 'S3Resources');

    const glueResources = new GlueResources(this, 'GlueResources', {
      insightsBucket: s3Resources.insightsBucket,
    });

    new AthenaResources(this, 'AthenaResources', {
      insightsBucket: s3Resources.insightsBucket,
      insightsDatabase: glueResources.insightsDatabase,
    });

    const lambdaResources = new LambdaResources(this, 'LambdaResources', {
      logLevel: props.logLevel,
      insightsBucket: s3Resources.insightsBucket,
      githubTokenSecretName: props.githubTokenSecretName,
    });

    new EventBridgeResources(this, 'EventBridgeResources', {
      insightQueryLambda: lambdaResources.insightQueryLambda,
    });

    new CfnOutput(this, 'InsightsBucketName', {
      value: s3Resources.insightsBucket.bucketName,
    });
  }
}

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

const stackProps = {
  logLevel: process.env.LOG_LEVEL || 'INFO',
  githubTokenSecretName:
    process.env.GITHUB_TOKEN_SECRET_NAME || '/github_insights/github_token',
};

const app = new App();

new GitHubInsights(app, 'GitHubInsights', {
  ...stackProps,
  env: devEnv,
});

app.synth();
