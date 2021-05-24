import * as cdk from '@aws-cdk/core'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as s3 from '@aws-cdk/aws-s3'
import * as redshift from '@aws-cdk/aws-redshift'
import * as rds from '@aws-cdk/aws-rds'
import * as glue from '@aws-cdk/aws-glue'
import * as athena from '@aws-cdk/aws-athena'
import * as iam from '@aws-cdk/aws-iam'
import { getDataAsyncWrapper } from '../bin/dnv2'
import { DatabaseClusterEngine, DatabaseInstanceEngine } from '@aws-cdk/aws-rds'
import { RemovalPolicy } from '@aws-cdk/core'

export class Dnv2Stack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props)
    ;(async () => {
      const newPlaceToUseData = await getDataAsyncWrapper()
      const mydata = JSON.parse(newPlaceToUseData)

      const applicationData = mydata.context.Application
      const applicationPrefix = applicationData.ApplicationName + '_'

      const createService = (serviceName: string) =>
        Object.entries(applicationData)
          .map((field) => field[0])
          .includes(serviceName)

      const serviceProps = (serviceName: string) =>
        Object.entries(applicationData)
          .filter((field) => field[0] === serviceName)
          .map((service) => service[1])[0] as any

      let vpcName = applicationData.VpcName
      let vpc
      let privateVpc
      if (vpcName == 'Default') {
        vpc = ec2.Vpc.fromLookup(this, 'VPC', { isDefault: true })
        if (
          createService('RDS') ||
          createService('Redshift') ||
          createService('Aurora')
        ) {
          privateVpc = new ec2.Vpc(this, 'Private VPC', {
            subnetConfiguration: [
              {
                cidrMask: 24,
                name: 'Ingress',
                subnetType: ec2.SubnetType.ISOLATED,
              },
            ],
          })
        }
      } else {
        vpc = ec2.Vpc.fromLookup(this, 'VPC', {
          vpcId: vpcName,
        })
      }

      // S3 Bucket
      const bucket = new s3.Bucket(this, 'exportBucket', {
        removalPolicy: RemovalPolicy.DESTROY,
      })

      const encryptionOptions: { [name: string]: s3.BucketEncryption } = {
        UNENCRYPTED: s3.BucketEncryption.UNENCRYPTED,
        KMS_MANAGED: s3.BucketEncryption.KMS_MANAGED,
        S3_MANAGED: s3.BucketEncryption.S3_MANAGED,
        KMS: s3.BucketEncryption.KMS,
      }

      const customerBucket =
        createService('S3') &&
        new s3.Bucket(this, `${applicationPrefix}customerBucket`, {
          ...serviceProps('S3'),
          encryption: encryptionOptions[serviceProps('S3').encryption],
          removalPolicy: RemovalPolicy.DESTROY,
        })

      customerBucket &&
        new cdk.CfnOutput(this, `${applicationPrefix}Bucket`, {
          value: customerBucket.bucketName,
        })

      const redshiftClusterProps = createService('Redshift') && {
        ...serviceProps('Redshift'),
        vpc: vpcName !== 'Default' ? vpc : privateVpc,
        vpcSubnets: {
          subnetType:
            vpcName !== 'Default'
              ? ec2.SubnetType.PRIVATE
              : ec2.SubnetType.ISOLATED,
        },
        removalPolicy: RemovalPolicy.DESTROY,
        numberOfNodes:
          serviceProps('Redshift').clusterType === 'single-node'
            ? undefined
            : serviceProps('Redshift').numberOfNodes &&
              serviceProps('Redshift').numberOfNodes > 1 &&
              serviceProps('Redshift').numberOfNodes < 100
            ? serviceProps('Redshift').numberOfNodes
            : 2,
      }

      const redshiftCluster =
        redshiftClusterProps &&
        new redshift.Cluster(
          this,
          `${applicationPrefix}RedshiftCluster`,
          redshiftClusterProps
        )

      // console.log(redshiftCluster, 'rc')
      redshiftCluster &&
        new cdk.CfnOutput(this, `${applicationPrefix}RedshiftClusterName`, {
          value: redshiftCluster.clusterName,
        })

      redshiftCluster &&
        new cdk.CfnOutput(this, `${applicationPrefix}RedshiftClusterEndpoint`, {
          value: JSON.stringify(redshiftCluster.clusterEndpoint),
        })

      const rdsEngines: { [name: string]: DatabaseInstanceEngine } = {
        'mysql_5.6': DatabaseInstanceEngine.mysql({
          version: rds.MysqlEngineVersion.VER_5_6,
        }),
        'mysql_5.7': DatabaseInstanceEngine.mysql({
          version: rds.MysqlEngineVersion.VER_5_7,
        }),
        mysql_8: DatabaseInstanceEngine.mysql({
          version: rds.MysqlEngineVersion.VER_8_0,
        }),
        postgres_10: DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_10,
        }),
        postgres_11: DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_11,
        }),
        postgres_12: DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_12,
        }),
        postgres_13: DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_13,
        }),
        mariaDB_10: DatabaseInstanceEngine.mariaDb({
          version: rds.MariaDbEngineVersion.VER_10_0,
        }),
        'mariaDB_10.1': DatabaseInstanceEngine.mariaDb({
          version: rds.MariaDbEngineVersion.VER_10_1,
        }),
        'mariaDB_10.2': DatabaseInstanceEngine.mariaDb({
          version: rds.MariaDbEngineVersion.VER_10_2,
        }),
        'mariaDB_10.3': DatabaseInstanceEngine.mariaDb({
          version: rds.MariaDbEngineVersion.VER_10_3,
        }),
        'mariaDB_10.4': DatabaseInstanceEngine.mariaDb({
          version: rds.MariaDbEngineVersion.VER_10_4,
        }),
        'mariaDB_10.5': DatabaseInstanceEngine.mariaDb({
          version: rds.MariaDbEngineVersion.VER_10_5,
        }),
      }

      const rdsEngine =
        createService('RDS') && rdsEngines[serviceProps('RDS').engine]

      // console.log(rdsEngine, 'rdse')
      const RDSProps = createService('RDS') && {
        ...serviceProps('RDS'),
        vpc: vpcName !== 'Default' ? vpc : privateVpc,
        vpcSubnets: {
          subnetType:
            vpcName !== 'Default'
              ? ec2.SubnetType.PRIVATE
              : ec2.SubnetType.ISOLATED,
        },
        engine: rdsEngine,
      }

      const RDSInstance =
        RDSProps &&
        new rds.DatabaseInstance(
          this,
          `${applicationPrefix}RDSDatabaseInstance`,
          RDSProps
        )

      console.log(RDSInstance, 'rds')
      RDSInstance &&
        new cdk.CfnOutput(this, `${applicationPrefix}DBEndpointAddress`, {
          value: RDSInstance.dbInstanceEndpointAddress,
        })
      RDSInstance &&
        new cdk.CfnOutput(this, `${applicationPrefix}DBPort`, {
          value: RDSInstance.dbInstanceEndpointPort,
        })

      const clusterEngines: { [name: string]: DatabaseClusterEngine } = {
        aurora_mysql: DatabaseClusterEngine.auroraMysql({
          version: rds.AuroraMysqlEngineVersion.VER_2_07_2,
        }),
        aurora_postgres: DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_12_4,
        }),
      }

      const clusterEngine =
        createService('Aurora') &&
        clusterEngines[serviceProps('Aurora').clusterEngine]

      const clusterProps = createService('Aurora') && {
        ...serviceProps('Aurora'),
        instanceProps: {
          ...serviceProps('Aurora').instanceProps,
          vpc: vpcName !== 'Default' ? vpc : privateVpc,
          vpcSubnets: {
            subnetType:
              vpcName !== 'Default'
                ? ec2.SubnetType.PRIVATE
                : ec2.SubnetType.ISOLATED,
          },
        },
        engine: clusterEngine,
      }

      const aurora =
        clusterProps &&
        new rds.DatabaseCluster(
          this,
          `${applicationPrefix}Aurora`,
          clusterProps
        )

      aurora &&
        new cdk.CfnOutput(this, `${applicationPrefix}ClusterEndpoint`, {
          value: aurora.clusterEndpoint.socketAddress,
        })

      aurora &&
        new cdk.CfnOutput(this, `${applicationPrefix}ClusterReadEndpoint`, {
          value: aurora.clusterReadEndpoint.socketAddress,
        })

      // Glue Database Creation
      const glueDB =
        createService('Glue') &&
        new glue.Database(this, `${applicationPrefix}MyDatabase`, {
          databaseName: serviceProps('Glue').databaseName,
        })

      // Glue Role
      const glueRole =
        glueDB &&
        new iam.Role(this, `${applicationPrefix}glueRole`, {
          assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName(
              'service-role/AWSGlueServiceRole'
            ),
            iam.ManagedPolicy.fromAwsManagedPolicyName(
              'AWSGlueConsoleFullAccess'
            ),
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
          ],
        })

      // Glue Crawler
      const glueCrawler =
        glueDB &&
        glueRole &&
        new glue.CfnCrawler(this, `${applicationPrefix}GlueCrawler`, {
          databaseName: glueDB.databaseName,
          tablePrefix: `${applicationPrefix}GlueTable`,
          role: glueRole.roleName, //required
          targets: {
            // Target to crawl
            s3Targets: [
              {
                path: `s3://${
                  serviceProps('Glue').bucketName ||
                  (customerBucket && customerBucket.bucketName)
                }/`,
              },
            ], // Bucket to crawl
          },
          schedule: {
            scheduleExpression:
              serviceProps('Glue').schedule || 'cron(0/5 * * * ? *)',
          },
        })

      const athenaWG =
        createService('Athena') &&
        serviceProps('Athena').workGroupName &&
        new athena.CfnWorkGroup(this, `${applicationPrefix}AthenaWG`, {
          name: serviceProps('Athena').workGroupName,
          description:
            serviceProps('Athena').workGroupDescription ||
            'A custom workgroup provisioned',
          workGroupConfiguration: {
            resultConfiguration: {
              outputLocation: bucket.s3UrlForObject(),
            },
          },
          recursiveDeleteOption: true,
        })

      const athenaDB =
        serviceProps('Athena').glueDbName ||
        (glueDB &&
          new athena.CfnNamedQuery(this, `${applicationPrefix}AthenaQuery`, {
            description:
              serviceProps('Athena').queryDescription || 'Sample Query',
            database: serviceProps('Athena').glueDbName || glueDB.databaseName,
            queryString:
              serviceProps('Athena').queryString ||
              `SELECT table_schema, table_name, table_type\nFROM information_schema.tables\nWHERE table_schema = '${
                serviceProps('Athena').glueDbName || glueDB.databaseName
              }'`,
            workGroup: athenaWG?.name || 'primary',
          }))

      athenaDB && athenaWG && athenaDB.addDependsOn(athenaWG)

      // Keep code above this line
    })()
  }
}
