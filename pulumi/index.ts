import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure";
import * as k8s from "@pulumi/kubernetes";

// Create an Azure Resource Group
const resourceGroup = new azure.core.ResourceGroup("myResourceGroup", {
    location: "East US",
});

// Create an AKS Cluster
const aksCluster = new azure.containerservice.KubernetesCluster("decent-mattermost", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    defaultNodePool: {
        name: "decent-mattermost",
        nodeCount: 1,
        vmSize: "Standard_B2s",
    },
    dnsPrefix: "decent-mattermost",
    linuxProfile: {
        adminUsername: "aksuser",
        sshKey: {
            keyData: "<your-ssh-public-key>",
        },
    },
    identity: {
        type: "SystemAssigned",
    },
});

// Export the Kubeconfig
export const kubeconfig = aksCluster.kubeConfigRaw;

// Create a Kubernetes provider instance
const k8sProvider = new k8s.Provider("k8sProvider", {
    kubeconfig: aksCluster.kubeConfigRaw,
});

// Deploy the application using Kubernetes resources
const appLabels = { app: "mattermost" };

const deployment = new k8s.apps.v1.Deployment("app-deployment", {
    spec: {
        selector: { matchLabels: appLabels },
        replicas: 1,
        template: {
            metadata: { labels: appLabels },
            spec: {
                containers: [{
                    name: "mattermost",
                    image: "mattermost/mattermost-team-edition:latest",
                    ports: [{ containerPort: 8065 }],
                    env: [
                        { name: "MM_CONFIG", value: "/mattermost/config/config.json" },
                        { name: "MM_SQLSETTINGS_DRIVERNAME", value: "postgres" },
                        { name: "MM_SQLSETTINGS_DATASOURCE", value: "postgres://mmuser:mmuser_password@db:5432/mattermost?sslmode=disable&connect_timeout=10" },
                    ],
                    volumeMounts: [
                        { name: "app-data", mountPath: "/mattermost/data" },
                        { name: "config", mountPath: "/mattermost/config" },
                    ],
                }],
                volumes: [
                    { name: "app-data", emptyDir: {} },
                    { name: "config", emptyDir: {} },
                ],
            },
        },
    },
}, { provider: k8sProvider });

const service = new k8s.core.v1.Service("app-service", {
    metadata: { labels: appLabels },
    spec: {
        type: "LoadBalancer",
        ports: [{ port: 8065, targetPort: 8065 }],
        selector: appLabels,
    },
}, { provider: k8sProvider });
