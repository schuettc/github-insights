import * as athena from 'aws-cdk-lib/aws-athena';
import * as glue from 'aws-cdk-lib/aws-glue';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface AthenaResourceProps {
  insightsDatabase: glue.CfnDatabase;
  insightsBucket: Bucket;
}
export class AthenaResources extends Construct {
  constructor(scope: Construct, id: string, props: AthenaResourceProps) {
    super(scope, id);

    // Create an Athena workgroup
    const workgroup = new athena.CfnWorkGroup(this, 'GitHubInsightsWorkgroup', {
      name: 'github-insights-workgroup',
      recursiveDeleteOption: true,
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: `s3://${props.insightsBucket.bucketName}/athena-results/`,
        },
      },
    });

    // Create a saved Athena query
    new athena.CfnNamedQuery(this, 'GitHubInsightsSampleQuery', {
      database: props.insightsDatabase.ref,
      queryString: `
            SELECT 
              reponame, 
              AVG(stars) as avg_stars, 
              AVG(forks) as avg_forks,
              AVG(openissues) as avg_open_issues,
              AVG(commitslastmonth) as avg_commits_last_month,
              AVG(uniquevisitors) as avg_unique_visitors,
              AVG(totalviews) as avg_total_views,
              AVG(uniquecloners) as avg_unique_cloners,
              AVG(totalclones) as avg_total_clones
            FROM 
              github_insights
            WHERE 
              year = '${new Date().getUTCFullYear()}'
              AND month = '${(new Date().getUTCMonth() + 1)
                .toString()
                .padStart(2, '0')}'
            GROUP BY 
              reponame
            ORDER BY 
              avg_stars DESC
          `,
      description:
        'Average stars, forks, open issues, and commits for each repository this month',
      name: 'GitHubInsightsMonthlyAverage',
      workGroup: workgroup.ref,
    });
  }
}
