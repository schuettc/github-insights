import { Stack } from 'aws-cdk-lib';
import * as glue from 'aws-cdk-lib/aws-glue';
import { CfnTable } from 'aws-cdk-lib/aws-glue';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface GlueResourcesProps {
  insightsBucket: Bucket;
}
export class GlueResources extends Construct {
  public insightsDatabase: glue.CfnDatabase;
  public insightsTable: CfnTable;

  constructor(scope: Construct, id: string, props: GlueResourcesProps) {
    super(scope, id);

    this.insightsDatabase = new glue.CfnDatabase(
      this,
      'GitHubInsightsDatabase',
      {
        catalogId: Stack.of(this).account,
        databaseInput: {
          name: 'github_insights_db',
        },
      },
    );

    // Define table schema
    const tableColumns: glue.CfnTable.ColumnProperty[] = [
      { name: 'reponame', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'stars', type: 'bigint' },
      { name: 'forks', type: 'bigint' },
      { name: 'openissues', type: 'bigint' },
      { name: 'closedissues', type: 'bigint' },
      { name: 'openpullrequests', type: 'bigint' },
      { name: 'mergedpullrequests', type: 'bigint' },
      { name: 'closedpullrequests', type: 'bigint' },
      { name: 'watchers', type: 'bigint' },
      { name: 'language', type: 'string' },
      { name: 'topics', type: 'array<string>' },
      { name: 'license', type: 'string' },
      { name: 'size', type: 'bigint' },
      { name: 'createdat', type: 'string' },
      { name: 'updatedat', type: 'string' },
      { name: 'pushedat', type: 'string' },
      { name: 'latestrelease', type: 'string' },
      { name: 'latestreleasedate', type: 'string' },
      { name: 'contributorscount', type: 'bigint' },
      { name: 'commitslastweek', type: 'bigint' },
      { name: 'commitslastmonth', type: 'bigint' },
      { name: 'averagetimetomergepr', type: 'double' },
      { name: 'averagetimetoclosepr', type: 'double' },
      { name: 'averagetimetocloseissue', type: 'double' },
      { name: 'date', type: 'string' },
    ];

    // Define partition keys
    const partitionKeys: glue.CfnTable.ColumnProperty[] = [
      { name: 'year', type: 'string' },
      { name: 'month', type: 'string' },
      { name: 'day', type: 'string' },
    ];

    // Create an Athena table with partition projection
    this.insightsTable = new glue.CfnTable(this, 'GitHubInsightsTable', {
      catalogId: Stack.of(this).account,
      databaseName: this.insightsDatabase.ref,
      tableInput: {
        name: 'github_insights',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          'EXTERNAL': 'TRUE',
          'parquet.compression': 'SNAPPY',
          'projection.enabled': 'true',
          'projection.year.type': 'integer',
          'projection.year.range': '2020,2030',
          'projection.year.digits': '4',
          'projection.month.type': 'integer',
          'projection.month.range': '1,12',
          'projection.month.digits': '2',
          'projection.day.type': 'integer',
          'projection.day.range': '1,31',
          'projection.day.digits': '2',
          'storage.location.template': `s3://${props.insightsBucket.bucketName}/github-insights/year=$\{year}/month=$\{month}/day=$\{day}`,
        },
        storageDescriptor: {
          location: `s3://${props.insightsBucket.bucketName}/github-insights/`,
          inputFormat:
            'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat',
          outputFormat:
            'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat',
          serdeInfo: {
            serializationLibrary:
              'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe',
            parameters: {
              'serialization.format': '1',
            },
          },
          columns: tableColumns,
        },
        partitionKeys: partitionKeys,
      },
    });
  }
}
