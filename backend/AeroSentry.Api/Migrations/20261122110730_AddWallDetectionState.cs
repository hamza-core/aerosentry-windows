using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122110730_AddWallDetectionState : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "DetectionEnabled",
            table: "Walls",
            type: "bit",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<double>(
            name: "DetectionThreshold",
            table: "Walls",
            type: "float",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "DetectionEnabled",
            table: "Walls");

        migrationBuilder.DropColumn(
            name: "DetectionThreshold",
            table: "Walls");
    }
}
